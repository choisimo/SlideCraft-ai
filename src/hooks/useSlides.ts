import { useState } from "react";
import { Deck, Slide, storage } from "@/lib/storage";

export function useSlides() {
  const [deck, setDeck] = useState<Deck>(() => storage.deck.get());
  const persist = (d: Deck) => {
    storage.deck.set(d);
    setDeck({ ...d });
  };

  const addSlide = () => {
    const id = crypto.randomUUID();
    persist({ ...deck, slides: [...deck.slides, { id, title: `새 슬라이드 ${deck.slides.length + 1}` }] });
  };
  const duplicate = (id: string) => {
    const s = deck.slides.find((x) => x.id === id);
    if (!s) return;
    const copy: Slide = { ...s, id: crypto.randomUUID(), title: `${s.title} (복제)` };
    const idx = deck.slides.findIndex((x) => x.id === id);
    const slides = [...deck.slides];
    slides.splice(idx + 1, 0, copy);
    persist({ ...deck, slides });
  };
  const remove = (id: string) => persist({ ...deck, slides: deck.slides.filter((s) => s.id !== id) });
  const rename = (id: string, title: string) => persist({ ...deck, slides: deck.slides.map((s) => (s.id === id ? { ...s, title } : s)) });
  const reorder = (from: number, to: number) => {
    const slides = [...deck.slides];
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    persist({ ...deck, slides });
  };

  return { deck, addSlide, duplicate, remove, rename, reorder };
}
