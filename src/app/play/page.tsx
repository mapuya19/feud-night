"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFeud } from "@/lib/store";
import { PhoneView } from "@/components/phone/PhoneView";
import { ErrorToast } from "@/components/ui";

function PlayInner() {
  const params = useSearchParams();
  const code = (params.get("g") ?? "").toUpperCase();
  const { connect, lastError, setError } = useFeud();

  useEffect(() => {
    if (code.length === 4) connect({ code, role: "player" });
    return () => undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (code.length !== 4) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-white/50">
        Missing room code — scan the QR code again.
      </div>
    );
  }
  return (
    <>
      {lastError && <ErrorToast message={lastError} onDone={() => setError(null)} />}
      <PhoneView code={code} />
    </>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-white/40">…</div>}>
      <PlayInner />
    </Suspense>
  );
}
