import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://boards.example-ats.com/northwind/jobs/1' });

const EMPTY = [] as unknown as DOMRectList;
const BOX = [{ x: 0, y: 0, width: 160, height: 24, top: 0, left: 0, right: 160, bottom: 24, toJSON: () => ({}) }] as unknown as DOMRectList;

Element.prototype.getClientRects = function getClientRects(this: Element): DOMRectList {
  const style = window.getComputedStyle(this);
  if (style.display === 'none' || style.visibility === 'hidden') return EMPTY;
  if ((this as HTMLElement).hidden) return EMPTY;
  return BOX;
};
