"use client";

import { useEffect, useRef, useState } from "react";
import type { NotebookEntry } from "@/engine/types";
import { PERSONA } from "@/lib/ui";

function Typewriter({ text, speed = 9 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 3)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <span className={n < text.length ? "caret" : ""}>{text.slice(0, n)}</span>;
}

export function Notebook({ entries, live }: { entries: NotebookEntry[]; live: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Pinned to the newest entry unless the reader deliberately scrolls up.
  const pinned = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el || !content.current) return;
    const follow = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    follow();
    const ro = new ResizeObserver(follow);
    ro.observe(content.current);
    return () => ro.disconnect();
  }, [entries.length]);

  if (!entries.length) {
    return <p className="px-2 py-6 text-center text-sm text-ink-4">The lab notebook is empty. Start a run.</p>;
  }
  const lastId = entries[entries.length - 1].id;
  const userScroll = () => {
    const el = box.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  return (
    <div
      ref={box}
      onWheel={() => requestAnimationFrame(userScroll)}
      onTouchMove={() => requestAnimationFrame(userScroll)}
      onKeyUp={userScroll}
      tabIndex={0}
      aria-label="Lab notebook"
      className="scroll-thin h-full overflow-y-auto pr-1"
    >
      <div ref={content} className="space-y-2.5">
      {entries.map((e) => {
        const p = PERSONA[e.persona];
        const isDiscovery = e.kind === "discovery";
        return (
          <div
            key={e.id}
            className={`rise grid grid-cols-[26px_1fr] gap-2.5 rounded-lg ${isDiscovery ? "border border-phosphor/40 bg-phosphor/5 p-2" : ""}`}
          >
            <span
              className="mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-md border text-[12px]"
              style={{ borderColor: p.color, color: p.color }}
              title={`${e.persona} — ${p.role}`}
            >
              {p.glyph}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[10.5px]">
                <span className="font-medium" style={{ color: p.color }}>
                  {e.persona}
                </span>
                <span className="font-mono text-ink-4">c{e.cycle}</span>
                {e.kind === "warning" && <span className="text-rose">▲</span>}
              </div>
              <p className={`text-[12.5px] leading-relaxed ${isDiscovery ? "text-phosphor" : e.kind === "warning" ? "text-ink-2" : "text-ink-2"}`}>
                {live && e.id === lastId ? <Typewriter text={e.text} /> : e.text}
              </p>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
