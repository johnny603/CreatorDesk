"use client";
import { useState } from "react";

export default function NewCommission() {
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function onSubmit(form: FormData) {
    const res = await fetch("/api/commissions", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return alert(await res.text());
    const { rawToken } = await res.json();
    setRawToken(rawToken);
    setLink(`${location.origin}/a/${rawToken}`);
  }

  if (link) {
    return (
      <main>
        <h1>Commission created</h1>
        <p>Send this link to your client. It is shown once.</p>
        <code>{link}</code>
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
