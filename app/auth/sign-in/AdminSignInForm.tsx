"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { ROUTINE_ADMIN_EMAIL } from "@/lib/auth/config";

export default function AdminSignInForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sendCode() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: ROUTINE_ADMIN_EMAIL,
        type: "sign-in",
      });
      if (error) throw error;
      setSent(true);
      setMessage(`A sign-in code was sent to ${ROUTINE_ADMIN_EMAIL}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the sign-in code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await authClient.signIn.emailOtp({
        email: ROUTINE_ADMIN_EMAIL,
        otp: code.trim(),
      });
      if (error) throw error;
      router.replace("/routine/manage");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The sign-in code could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-sign-in panel">
      <span className="eyebrow">Authorized account</span>
      <h2>{ROUTINE_ADMIN_EMAIL}</h2>
      <p>Only this verified email can open routine management or start a manual sync.</p>
      {sent ? (
        <form onSubmit={verifyCode} className="admin-sign-in-form">
          <label htmlFor="admin-sign-in-code">Email code</label>
          <input id="admin-sign-in-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          <button className="button button-primary" type="submit" disabled={busy || !code.trim()}>{busy ? "Verifying…" : "Verify and continue"}</button>
        </form>
      ) : (
        <button className="button button-primary" type="button" onClick={sendCode} disabled={busy}>{busy ? "Sending code…" : "Send sign-in code"}</button>
      )}
      {message ? <p className="admin-sign-in-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}
