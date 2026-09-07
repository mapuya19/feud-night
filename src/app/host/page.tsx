"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useFeud } from "@/lib/store";
import { loadHost } from "@/lib/identity";
import { HostView } from "@/components/host/HostView";
import { ErrorToast } from "@/components/ui";

function HostInner() {
  const params = useSearchParams();
  const code = (params.get("g") ?? "").toUpperCase();
  const { connect, lastError, setError } = useFeud();

  useEffect(() => {
    if (code.length !== 4) return;
    const hostToken = loadHost(code);
    if (hostToken) connect({ code, role: "host", hostToken });
    // No token on this browser → read-only is not allowed for hosts; the
    // host console requires the browser that created the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (code.length !== 4) {
    return <div className="flex min-h-dvh items-center justify-center text-white/50">Missing room code.</div>;
  }
  const hostToken = loadHost(code);
  if (!hostToken) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-white/60">
          This browser isn&apos;t the host of room <span className="display">{code}</span>.
        </p>
        <p className="text-sm text-white/35">
          Open the landing page on the host laptop and create the room there (or use the same browser you created it with).
        </p>
      </div>
    );
  }
  return (
    <>
      {lastError && <ErrorToast message={lastError} onDone={() => setError(null)} />}
      <HostView code={code} />
    </>
  );
}

export default function HostPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-white/40">…</div>}>
      <HostInner />
    </Suspense>
  );
}
