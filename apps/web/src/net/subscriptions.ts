export interface PublicationLike {
  isSubscribed: boolean;
}

export interface ParticipantLike<P extends PublicationLike = PublicationLike> {
  identity: string;
  publications: Iterable<P>;
}

export interface SubscriptionChange<P extends PublicationLike> {
  identity: string;
  publication: P;
  subscribe: boolean;
}

/**
 * Decide qué publicaciones hay que suscribir/desuscribir: solo las de los
 * participantes audibles deben estar suscritas. Devuelve únicamente los cambios.
 */
export function computeSubscriptions<P extends PublicationLike>(
  audibleIds: Iterable<string>,
  participants: Iterable<ParticipantLike<P>>,
): Array<SubscriptionChange<P>> {
  const audible = new Set(audibleIds);
  const changes: Array<SubscriptionChange<P>> = [];
  for (const participant of participants) {
    const want = audible.has(participant.identity);
    for (const publication of participant.publications) {
      if (publication.isSubscribed !== want) changes.push({ identity: participant.identity, publication, subscribe: want });
    }
  }
  return changes;
}
