"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFeud } from "@/lib/store";
import { BoardView } from "@/components/board/BoardView";

function BoardInner() {
  const params = useSearchParams();
  const code = (params.get("g") ?? "").toUpperCase();
  const { connect } = useFeud();

  useEffect(() => {
    if (code.length === 4) connect({ code, role: "board" });
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (code.length !== 4) {
    return <div className="flex min-h-dvh items-center justify-center text-white/50">Missing room code.</div>;
  }
  return <BoardView />;
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-white/40">…</div>}>
      <BoardInner />
    </Suspense>
  );
}
