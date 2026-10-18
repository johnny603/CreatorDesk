"use client";
import { useState } from "react";

export default function NewCommission() {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(form: FormData) {
    const res = await fetch("/api/commissions", { method: "POST", body: form });
    if (!res.ok) return alert(await res.text());
    const { rawToken } = await res.json();
    setLink(`${location.origin}/a/${rawToken}`);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail if the page isn't focused or in some browsers.
      // The <code> element is still selectable; no error state needed.
    }
  }

  if (link) {
    return (
      <main>
        <h1>Commission created</h1>
        <p>
          Send this link to your client. <strong>It is shown once.</strong> If you
          lose it, you can rotate it from the commission page — the old link
          will stop working.
        </p>
        <p>
          <code>{link}</code>
        </p>
        <p>
          <button onClick={copy} type="button">{copied ? "Copied!" : "Copy link"}</button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>New commission</h1>
      <form action={onSubmit}>
        <p><input name="title" placeholder="Title" required /></p>
        <p><input name="clientName" placeholder="Client name" required /></p>
        <p><input name="clientEmail" placeholder="Client email (optional)" /></p>
        <p><button type="submit">Create</button></p>
      </form>
    </main>
  );
}
