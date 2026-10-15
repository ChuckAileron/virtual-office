import desk from '../../../../assets/interiores-canvas-grid-67x70/assets/desk.png';
import bookshelf from '../../../../assets/interiores-canvas-grid-67x70/assets/bookshelf.png';
import chair from '../../../../assets/interiores-canvas-grid-67x70/assets/chair.png';
import chairBlue from '../../../../assets/interiores-canvas-grid-67x70/assets/chair_blue.png';
import sofaBeige from '../../../../assets/interiores-canvas-grid-67x70/assets/sofa_beige.png';
import sofaBlue from '../../../../assets/interiores-canvas-grid-67x70/assets/sofa_blue.png';
import sofaVertical from '../../../../assets/interiores-canvas-grid-67x70/assets/sofa_vertical.png';
import woodTile from '../../../../assets/interiores-canvas-grid-67x70/assets/wood_tile.png';

const URLs = { desk, bookshelf, chair, chairBlue, sofaBeige, sofaBlue, sofaVertical, woodTile } as const;
export type InteriorAssetName = keyof typeof URLs;
const images = new Map<InteriorAssetName, HTMLImageElement>();

/** PNG pixel art de la referencia aprobada; se cargan de forma perezosa. */
export function interiorImage(name: InteriorAssetName): HTMLImageElement {
  let image = images.get(name);
  if (!image) {
    image = new Image();
    image.src = URLs[name];
    images.set(name, image);
  }
  return image;
}

export const interiorImageReady = (image: HTMLImageElement): boolean => image.complete && image.naturalWidth > 0;
