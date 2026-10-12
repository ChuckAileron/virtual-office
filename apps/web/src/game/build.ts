import { supportsSideView, type Accessories, type CatalogEntry } from '@vo/shared';
import { canPlaceFloorDecoration, canPlaceObject, canPlacePet, floorDecorationAt, objectAt, petAt } from './placement';
import type { GameState } from './state';

export const DEFAULT_MSG = 'Elige un objeto y haz clic en el piso. Clic derecho o Esc para cancelar.';
export type BuildTab = 'office' | 'char';

export interface BuildView {
  open: boolean;
  selected: CatalogEntry | null;
  perspective: 'front' | 'side';
  flipped: boolean;
  selectedFloorDecoration: { imageUrl: string; w: number; h: number } | null;
  petKind: string | null;
  petColor: string;
  removing: boolean;
  hover: { x: number; y: number } | null;
}

export interface BuildActions {
  place(kind: string, x: number, y: number, perspective: 'front' | 'side', flipped: boolean): void;
  removeObject(id: number): void;
  placeFloorDecoration(imageUrl: string, x: number, y: number, w: number, h: number): void;
  removeFloorDecoration(id: number): void;
  placePet(kind: string, color: string, x: number, y: number): void;
  removePet(id: number): void;
  setLook(acc: Partial<Accessories>): void;
}

export class BuildController implements BuildView {
  open = false;
  tab: BuildTab = 'office';
  selected: CatalogEntry | null = null;
  perspective: 'front' | 'side' = 'front';
  flipped = false;
  selectedFloorDecoration: { imageUrl: string; w: number; h: number } | null = null;
  petKind: string | null = null;
  petColor = '';
  removing = false;
  hover: { x: number; y: number } | null = null;
  message = DEFAULT_MSG;
  messageIsError = false;
  private errTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly getState: () => GameState | null,
    private readonly actions: BuildActions,
    private readonly notify: () => void,
  ) {}

  /** Se llama al recibir `welcome`. */
  init(): void {
    this.petColor = this.getState()?.petColors[0]?.id ?? '';
    this.close();
  }

  toggle(): void { if (this.open) this.close(); else this.openPanel(); }

  openPanel(): void {
    this.open = true;
    this.clearSelection();
    this.setMessage(DEFAULT_MSG);
  }

  close(): void {
    this.open = false;
    this.tab = 'office';
    this.clearSelection();
    this.hover = null;
    clearTimeout(this.errTimer);
    this.setMessage(DEFAULT_MSG);
  }

  private clearSelection(): void {
    this.selected = null;
    this.perspective = 'front';
    this.flipped = false;
    this.selectedFloorDecoration = null;
    this.petKind = null;
    this.removing = false;
  }

  setMessage(text: string, isError = false): void {
    this.message = text;
    this.messageIsError = isError;
    clearTimeout(this.errTimer);
    if (isError) this.errTimer = setTimeout(() => this.setMessage(DEFAULT_MSG), 3500);
    this.notify();
  }

  error(text: string): void { this.setMessage(text, true); }

  setTab(tab: BuildTab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.clearSelection();
    this.hover = null;
    this.setMessage(tab === 'char'
      ? 'Elige peinado, colores y accesorios: se aplican al instante. Clic de nuevo para quitar.'
      : DEFAULT_MSG);
  }

  selectObject(def: CatalogEntry | null): void {
    const next = def && this.selected?.type === def.type ? null : def;
    this.clearSelection();
    this.selected = next;
    this.perspective = 'front';
    this.flipped = false;
    this.setMessage(next ? `${next.name}: haz clic en el piso para colocarlo` : DEFAULT_MSG);
  }

  setPerspective(perspective: 'front' | 'side'): void {
    if (!this.selected || !supportsSideView(this.selected.type)) return;
    this.perspective = perspective;
    if (perspective === 'front') this.flipped = false;
    this.notify();
  }

  setFlipped(flipped: boolean): void {
    if (!this.selected || !supportsSideView(this.selected.type) || this.perspective !== 'side') return;
    this.flipped = flipped;
    this.notify();
  }

  selectFloorDecoration(imageUrl: string, w: number, h: number): void {
    this.clearSelection();
    this.selectedFloorDecoration = { imageUrl, w, h };
    this.setMessage(`Imagen ${w}×${h} tiles: haz clic dentro de una oficina para colocarla.`);
  }

  selectPet(kind: string | null): void {
    const next = kind && this.petKind === kind ? null : kind;
    this.clearSelection();
    this.petKind = next;
    const k = this.getState()?.petKinds.find((p) => p.type === next);
    this.setMessage(k ? `${k.name}: haz clic dentro de una oficina o sala` : DEFAULT_MSG);
  }

  setPetColor(id: string): void { this.petColor = id; this.notify(); }

  toggleRemoving(): void {
    const next = !this.removing;
    this.clearSelection();
    this.removing = next;
    this.setMessage(next ? 'Haz clic sobre un objeto, mascota o imagen de piso para quitarlo' : DEFAULT_MSG);
  }

  setHover(tile: { x: number; y: number } | null): void { this.hover = tile; }

  /** Clic izquierdo sobre un tile del mapa. */
  clickTile(x: number, y: number): void {
    const s = this.getState();
    if (!s || !this.open) return;
    if (this.removing) {
      const pet = petAt(s, x, y);
      if (pet) { this.actions.removePet(pet.id); return; }
      const o = objectAt(s, x, y);
      if (o) this.actions.removeObject(o.id);
      else {
        const decoration = floorDecorationAt(s, x, y);
        if (decoration) this.actions.removeFloorDecoration(decoration.id);
      }
    } else if (this.petKind) {
      this.actions.placePet(this.petKind, this.petColor, x, y);
    } else if (this.selectedFloorDecoration) {
      const d = this.selectedFloorDecoration;
      this.actions.placeFloorDecoration(d.imageUrl, x, y, d.w, d.h);
    } else if (this.selected) {
      this.actions.place(this.selected.type, x, y, this.perspective, this.flipped);
    }
  }

  /** Clic derecho: cancela la selección actual. */
  cancel(): void {
    if (this.open) this.selectObject(null);
  }

  /** Esc: cancela la selección o cierra el panel. Devuelve true si lo consumió. */
  escape(): boolean {
    if (!this.open) return false;
    if (this.selected || this.selectedFloorDecoration || this.removing || this.petKind) this.selectObject(null); else this.close();
    return true;
  }

  canPlaceHere(): boolean {
    const s = this.getState();
    if (!s || !this.hover) return false;
    if (this.petKind) return canPlacePet(s, this.hover.x, this.hover.y);
    if (this.selectedFloorDecoration) {
      return canPlaceFloorDecoration(s, this.selectedFloorDecoration.w, this.selectedFloorDecoration.h, this.hover.x, this.hover.y);
    }
    if (this.selected) return canPlaceObject(s, this.selected, this.hover.x, this.hover.y);
    return false;
  }
}
