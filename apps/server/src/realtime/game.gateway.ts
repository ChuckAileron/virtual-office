import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, OnModuleDestroy } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import {
  ACCESSORY_CATALOG, CATALOG_LIST, DIRS, FLOOR_IMAGE_URL_PATTERN, GAME, MAX_FLOOR_DECORATIONS,
  PET_COLORS, PET_KINDS, T, canConvene, floorDecorationFitsOffice, formatCode, isWalkable, meetingHead, meetingSeats, officeAt, styleAllowed,
  sanitizeAccessories, sanitizeAppearancePatch, stepPet, supportsSideView, validatePet, validatePlacement, rebuildBlocked,
  type ClientToServerEvents, type Dir, type PlayerView, type Seat, type ServerToClientEvents,
} from '@vo/shared';
import { AuthService } from '../auth/auth.service';
import { APP_CONFIG, AppConfig } from '../config';
import { Repository, UserRow } from '../db/repository';
import { RoomsService } from '../rooms/rooms.service';
import type { GameSocket, Player, RoomRuntime } from '../rooms/room.types';
import { dropAudible, refreshAudible } from './audible';
import { VoiceService } from './voice.service';

const EDIT_THROTTLE_MS = 120;
const LOOK_THROTTLE_MS = 100;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const cleanText = (s: unknown, max: number) =>
  String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

const view = (p: Player): PlayerView => ({
  id: p.id, name: p.name, appearance: p.appearance, x: p.x, y: p.y, dir: p.dir, voice: p.voice, idle: p.idle, role: p.role,
});

@WebSocketGateway()
export class GameGateway implements OnGatewayInit, OnModuleDestroy {
  private server!: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly online = new Map<number, Player>();
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(Repository) private readonly repo: Repository,
    @Inject(VoiceService) private readonly voice: VoiceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  afterInit(server: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.server = server;
    server.use(async (socket, next) => {
      const user = await this.auth.userFromToken(socket.handshake.auth?.token);
      if (!user) return next(new Error('Sesión inválida. Inicia sesión de nuevo'));
      socket.data.user = user;
      next();
    });
    server.on('connection', (socket) => this.onConnection(socket));
    this.timers.push(setInterval(() => this.sweepIdle(), Math.min(5000, Math.max(50, this.config.idleMs / 4))));
    this.timers.push(setInterval(() => this.tickPets(), this.config.petTickMs));
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private onConnection(socket: GameSocket) {
    const user = socket.data.user as UserRow;
    let player: Player | null = null;

    socket.on('join', (p) => {
      if (player) return;
      const room = this.rooms.find(p?.code);
      if (!room) return void socket.emit('error', { error: 'Código de invitación inválido' });
      const previous = this.online.get(user.id);
      if (previous) {
        this.removePlayer(previous);
        previous.socket.emit('replaced');
        previous.socket.disconnect(true);
      }
      const spawn = this.spawnPoint(room);
      if (!spawn) return void socket.emit('error', { error: 'No hay espacio libre en el espacio de trabajo' });
      const now = Date.now();
      player = {
        id: randomBytes(4).toString('hex'), userId: user.id, socket, room, name: user.username,
        appearance: user.appearance, role: user.role, x: spawn.x, y: spawn.y, dir: 'down', voice: false, idle: false,
        lastMove: 0, lastActive: now, lastEdit: 0, lastLook: 0, lastAlarm: 0, audible: new Set(),
      };
      room.players.set(player.id, player);
      this.online.set(user.id, player);
      socket.emit('welcome', {
        you: player.id,
        room: { code: formatCode(room.code), name: room.name, size: room.size, tiles: room.tiles, offices: room.offices },
        objects: room.objects,
        catalog: CATALOG_LIST,
        pets: room.pets,
        floorDecorations: room.floorDecorations,
        floorStyles: room.floorStyles,
        petKinds: PET_KINDS.map((k) => ({ ...k })),
        petColors: PET_COLORS.map((c) => ({ ...c })),
        accessories: ACCESSORY_CATALOG,
        players: [...room.players.values()].map(view),
      });
      socket.to(this.channel(room)).emit('joined', { player: view(player) });
      socket.join(this.channel(room));
      this.pushAudible(room, player);
    });

    // Cada manejador exige haber entrado a un espacio de trabajo.
    const guard = <A extends unknown[]>(fn: (p: Player, room: RoomRuntime, ...args: A) => void) =>
      (...args: A) => {
        if (!player?.room) return;
        player.lastActive = Date.now();
        this.setIdle(player, false);
        fn(player, player.room, ...args);
      };

    socket.on('activity', guard(() => {}));

    socket.on('move', guard((p, room, data) => {
      const d = DIRS[data?.dir];
      const now = Date.now();
      if (!d || now - p.lastMove < GAME.MOVE_INTERVAL_MS) return;
      p.lastMove = now;
      p.dir = data.dir;
      const nx = p.x + d[0];
      const ny = p.y + d[1];
      if (isWalkable(room.tiles, nx, ny) && !room.blocked.has(`${nx},${ny}`)) { p.x = nx; p.y = ny; }
      this.server.to(this.channel(room)).emit('moved', { id: p.id, x: p.x, y: p.y, dir: p.dir });
      this.pushAudible(room, p);
    }));

    socket.on('chat', guard((p, room, data) => {
      const text = cleanText(data?.text, GAME.CHAT_MAX);
      if (!text) return;
      const myOffice = officeAt(room.offices, p.x, p.y);
      for (const o of room.players.values()) {
        const near = Math.hypot(o.x - p.x, o.y - p.y) <= GAME.CHAT_RADIUS;
        const sameOffice = myOffice && officeAt(room.offices, o.x, o.y) === myOffice;
        if (near || sameOffice) o.socket.emit('chat', { id: p.id, name: p.name, text });
      }
    }));

    socket.on('place', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const error = validatePlacement(room, data?.kind, data?.x, data?.y);
      if (error) return void socket.emit('build_error', { error });
      const canFaceSide = supportsSideView(data.kind);
      const perspective = canFaceSide && data.perspective === 'side' ? 'side' : 'front';
      const flipped = perspective === 'side' && data.flipped === true;
      const object = await this.repo.addObject(room.code, data.kind, data.x, data.y, perspective, flipped);
      room.objects.push(object);
      rebuildBlocked(room);
      this.server.to(this.channel(room)).emit('object_add', { object });
    }));

    socket.on('remove_object', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const idx = room.objects.findIndex((o) => o.id === data?.id);
      if (idx < 0) return void socket.emit('build_error', { error: 'Ese objeto ya no existe' });
      const [removed] = room.objects.splice(idx, 1);
      rebuildBlocked(room);
      await this.repo.removeObject(room.code, removed.id);
      this.server.to(this.channel(room)).emit('object_remove', { id: removed.id });
    }));

    socket.on('place_pet', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const error = validatePet(room, data?.kind, data?.color, data?.x, data?.y);
      if (error) return void socket.emit('build_error', { error });
      const pet = await this.repo.addPet(room.code, data.kind, data.color, data.x, data.y);
      room.pets.push(pet);
      this.server.to(this.channel(room)).emit('pet_add', { pet });
    }));

    socket.on('remove_pet', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const idx = room.pets.findIndex((x) => x.id === data?.id);
      if (idx < 0) return void socket.emit('build_error', { error: 'Esa mascota ya no existe' });
      const [removed] = room.pets.splice(idx, 1);
      await this.repo.removePet(room.code, removed.id);
      this.server.to(this.channel(room)).emit('pet_remove', { id: removed.id });
    }));

    socket.on('place_floor_decoration', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      if (room.floorDecorations.length >= MAX_FLOOR_DECORATIONS) {
        return void socket.emit('build_error', { error: 'Se alcanzó el máximo de imágenes de piso' });
      }
      if (!FLOOR_IMAGE_URL_PATTERN.test(data?.imageUrl ?? '')
        || !fs.existsSync(path.join(this.config.uploadsDir, path.basename(data.imageUrl)))) {
        return void socket.emit('build_error', { error: 'La imagen seleccionada ya no está disponible' });
      }
      if (!floorDecorationFitsOffice(room.offices, data?.x, data?.y, data?.w, data?.h)) {
        return void socket.emit('build_error', { error: 'La imagen debe quedar dentro de una oficina; revisa su tamaño en tiles' });
      }
      const decoration = await this.repo.addFloorDecoration(room.code, data.imageUrl, data.x, data.y, data.w, data.h);
      room.floorDecorations.push(decoration);
      this.server.to(this.channel(room)).emit('floor_decoration_add', { decoration });
    }));

    socket.on('remove_floor_decoration', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const idx = room.floorDecorations.findIndex((d) => d.id === data?.id);
      if (idx < 0) return void socket.emit('build_error', { error: 'Esa imagen ya no existe' });
      const [removed] = room.floorDecorations.splice(idx, 1);
      await this.repo.removeFloorDecoration(room.code, removed.id);
      this.server.to(this.channel(room)).emit('floor_decoration_remove', { id: removed.id });
    }));

    socket.on('set_office_floor_style', guard(async (p, room, data) => {
      if (!this.editAllowed(p)) return;
      const office = officeAt(room.offices, p.x, p.y);
      if (!office) return void socket.emit('build_error', { error: 'Debes estar dentro de una oficina para decorar su piso' });
      if (data?.officeId !== office.id || (data.pattern !== 'solid' && data.pattern !== 'checker')
        || typeof data.color !== 'string' || !HEX_COLOR.test(data.color)) {
        return void socket.emit('build_error', { error: 'Estilo de piso inválido' });
      }
      const style = { officeId: office.id, color: data.color.toLowerCase(), pattern: data.pattern };
      await this.repo.saveOfficeFloorStyle(room.code, style);
      const index = room.floorStyles.findIndex((entry) => entry.officeId === office.id);
      if (index < 0) room.floorStyles.push(style);
      else room.floorStyles[index] = style;
      this.server.to(this.channel(room)).emit('office_floor_style', { style });
    }));

    socket.on('set_look', guard(async (p, room, data) => {
      const now = Date.now();
      if (now - p.lastLook < LOOK_THROTTLE_MS) return;
      p.lastLook = now;
      const next = {
        ...p.appearance,
        ...sanitizeAppearancePatch(data?.look),
        acc: data?.acc ? sanitizeAccessories(data.acc) : p.appearance.acc,
      };
      if (!styleAllowed(next.gender, next.style)) next.style = p.appearance.style;
      p.appearance = next;
      await this.repo.updateAppearance(p.userId, p.appearance);
      this.server.to(this.channel(room)).emit('look', { id: p.id, appearance: p.appearance });
    }));

    socket.on('voice', guard((p, room, data) => {
      p.voice = data?.on === true;
      this.server.to(this.channel(room)).emit('voice', { id: p.id, on: p.voice });
    }));

    socket.on('alarm', guard((p, room, data) => {
      const now = Date.now();
      if (now - p.lastAlarm < GAME.ALARM_COOLDOWN_MS) return;
      p.lastAlarm = now;
      const message = cleanText(data?.message, GAME.ALARM_MESSAGE_MAX);
      this.server.to(this.channel(room)).emit('alarm', {
        from: p.id, name: p.name, message, durationMs: GAME.ALARM_DURATION_MS,
      });
    }));

    // Convoca a todos los presentes a la sala de reuniones (solo jefe o admin).
    socket.on('convene', guard((p, room) => {
      if (!canConvene(p.role)) {
        return void socket.emit('notice', { text: 'Solo el jefe o un administrador pueden convocar a la reunión' });
      }
      if (!room.offices.some((o) => o.kind === 'conference')) {
        return void socket.emit('notice', { text: 'Este espacio de trabajo no tiene sala de reuniones' });
      }
      const players = [...room.players.values()];
      const seats = meetingSeats(room.offices, room.tiles, room.blocked, players.length);
      // El jefe no tiene silla (hay una por oficina): preside de pie al extremo izquierdo.
      const head = meetingHead(room.offices, room.tiles);
      const pool = head ? seats.filter((s) => s.x !== head.x || s.y !== head.y) : seats;
      const moved: Array<{ id: string; x: number; y: number; dir: Dir }> = [];
      let next = 0;
      let headUsed = false;
      for (const other of players) {
        let seat: Seat | null;
        if (other.role === 'boss' && head && !headUsed) {
          headUsed = true;
          seat = head;
        } else {
          seat = pool[next++] ?? null;
        }
        if (!seat) continue;
        other.x = seat.x;
        other.y = seat.y;
        other.dir = seat.dir;
        moved.push({ id: other.id, x: seat.x, y: seat.y, dir: seat.dir });
      }
      this.server.to(this.channel(room)).emit('convened', { by: p.name, seats: moved });
      for (const other of players) this.pushAudible(room, other);
    }));

    // Gestión de roles: son acciones de cuenta, no requieren estar dentro de una sala.
    socket.on('list_users', async (ack) => {
      if (typeof ack !== 'function') return;
      const actor = socket.data.user as UserRow;
      if (actor.role !== 'admin') return ack({ users: [] });
      ack({ users: await this.repo.listUsers() });
    });

    socket.on('assign_role', async (data) => {
      const actor = socket.data.user as UserRow;
      if (actor.role !== 'admin') {
        return void socket.emit('notice', { text: 'Solo un administrador puede asignar el rol de jefe' });
      }
      const role = data?.role;
      if (role !== 'boss' && role !== 'member') {
        return void socket.emit('notice', { text: 'Rol inválido' });
      }
      try {
        const updated = await this.auth.assignRole(String(data?.username ?? ''), role);
        const online = this.online.get(updated.id);
        if (online) {
          online.role = role;
          online.socket.emit('role', { id: online.id, role });
        }
        socket.emit('notice', {
          text: role === 'boss' ? `${updated.username} ahora es jefe` : `${updated.username} ya no es jefe`,
        });
      } catch (e) {
        socket.emit('notice', { text: e instanceof Error ? e.message : 'No se pudo asignar el rol' });
      }
    });

    socket.on('voice_token', async (ack) => {
      if (typeof ack !== 'function') return;
      if (!player?.room) return ack({ ok: false, error: 'Entra a un espacio de trabajo primero' });
      try {
        ack(await this.voice.createToken(player.room.code, player.id, player.name));
      } catch {
        ack({ ok: false, error: 'No se pudo generar el token de voz' });
      }
    });

    socket.on('disconnect', () => {
      if (player) this.removePlayer(player);
    });
  }

  private channel(room: RoomRuntime) {
    return `room:${room.code}`;
  }

  private editAllowed(p: Player): boolean {
    const now = Date.now();
    if (now - p.lastEdit < EDIT_THROTTLE_MS) return false;
    p.lastEdit = now;
    return true;
  }

  private spawnPoint(room: RoomRuntime) {
    // Los personajes aparecen en la entrada (lobby); si el espacio es antiguo y no
    // tiene lobby, se usa cualquier tile libre del pasillo.
    const lobby: Array<{ x: number; y: number }> = [];
    const fallback: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < room.tiles.length; y++) {
      for (let x = 0; x < room.tiles[0].length; x++) {
        if (room.blocked.has(`${x},${y}`)) continue;
        const t = room.tiles[y][x];
        if (t === T.LOBBY) lobby.push({ x, y });
        else if (t === T.FLOOR) fallback.push({ x, y });
      }
    }
    const free = lobby.length ? lobby : fallback;
    return free[Math.floor(Math.random() * free.length)] ?? null;
  }

  private pushAudible(room: RoomRuntime, p: Player) {
    for (const c of refreshAudible(room, p)) c.socket.emit('audible', { ids: [...c.audible] });
  }

  private removePlayer(p: Player) {
    const room = p.room;
    if (!room) return;
    room.players.delete(p.id);
    p.room = null;
    if (this.online.get(p.userId) === p) this.online.delete(p.userId);
    p.socket.leave(this.channel(room));
    this.server.to(this.channel(room)).emit('left', { id: p.id });
    for (const c of dropAudible(room, p)) c.socket.emit('audible', { ids: [...c.audible] });
  }

  private setIdle(p: Player, idle: boolean) {
    if (p.idle === idle || !p.room) return;
    p.idle = idle;
    this.server.to(this.channel(p.room)).emit('presence', { id: p.id, idle });
  }

  private sweepIdle() {
    const now = Date.now();
    for (const room of this.rooms.all()) {
      for (const p of room.players.values()) {
        if (!p.idle && now - p.lastActive > this.config.idleMs) this.setIdle(p, true);
      }
    }
  }

  private tickPets() {
    for (const room of this.rooms.all()) {
      if (!room.players.size) continue;
      for (const pet of room.pets) {
        if (stepPet(room, pet)) this.server.to(this.channel(room)).emit('pet_move', { id: pet.id, x: pet.x, y: pet.y, dir: pet.dir });
      }
    }
  }
}
