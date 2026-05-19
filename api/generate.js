export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { answers, vorname, nachname, email } = req.body;

  if (!answers || !vorname || !nachname || !email) {
    return res.status(400).json({ error: "Fehlende Felder" });
  }

  const txt = answers.map((x, i) => `F${i + 1}: ${x.q}\nA: ${x.a}`).join("\n\n");

  try {
    // 1. KI Report generieren
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1400,
        messages: [{
          role: "user",
          content: `Du bist Caro Brandt, Beziehungscoach spezialisiert auf die Trigger Shift Methode. Du erstellst einen personalisierten Trigger-Report.

DEINE AUFGABE: Zeige der Person ihr Muster klar und tief, aber gib KEINE Lösung. Der Report soll das Muster sichtbar machen, nicht lösen. Die Person soll am Ende das Gefühl haben: Ich werde hier wirklich gesehen. Und ich brauche Unterstützung um das wirklich zu verändern.

WICHTIG:
- Deutsch, du-Form, empathisch, direkt
- Keine Begriffe wie toxisch oder Narzisst
- Kurze Absätze, warm aber klar
- Kein Psycho-Jargon
- Name der Person: ${vorname} ${nachname}
- KEINE Lösungen, KEINE Tipps, KEINE Anleitungen
- Zeige die Tiefe des Musters, nicht den Weg raus

AUCH BEI POSITIVEN ANTWORTEN: Jeder Mensch hat Trigger. Wer positiv antwortet, hat sie entweder gut kontrolliert, tief vergraben, oder kennt sie noch nicht in ihrer vollen Tiefe. Zeige genau das: die Stille vor dem nächsten Sturm, das was noch unberührt liegt, die Lücke zwischen Kontrolle und echter innerer Freiheit.

Antworten:
${txt}

Gib NUR ein JSON-Objekt zurück, ohne Einleitung, ohne Backticks:
{"profilName":"kurzer prägnanter Profilname","profilSub":"ein Satz der das Profil beschreibt","kernmuster":"das zentrale Muster in 2-3 Sätzen, konkret und nah","tiefe":"was dieses Muster kostet in Beziehungen und in der Verbindung zu sich selbst, 2-3 Sätze, keine Urteile","koerper":"das typische Körpersignal das diesem Muster vorausgeht, 1-2 Sätze","musterFrage":"eine einzige offene Frage die das Muster vertieft, keine Antwort liefern","einladung":"persönliche warme Einladung zum kostenlosen Klarheitsgespräch mit Caro, 3-4 Sätze, nicht lösen sondern einladen"}`
        }]
      })
    });

    if (!aiRes.ok) throw new Error(`Anthropic Fehler ${aiRes.status}`);
    const aiData = await aiRes.json();
    const raw = aiData.content[0].text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Kein JSON gefunden");
    const report = JSON.parse(match[0]);

    // 2. Kontakt in Brevo anlegen
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_KEY },
      body: JSON.stringify({
        email: email.trim(),
        attributes: { FIRSTNAME: vorname.trim(), LASTNAME: nachname.trim() },
        listIds: [parseInt(process.env.BREVO_LISTE_ID)],
        updateEnabled: true
      })
    });

    // 3. Report per E-Mail senden
    const emailHtml = buildEmailHtml(vorname, nachname, report);
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_KEY },
      body: JSON.stringify({
        sender: { name: "Caro Brandt", email: process.env.ABSENDER_EMAIL },
        to: [{ email: email.trim(), name: `${vorname} ${nachname}` }],
        subject: `${vorname}, dein persönliches Triggerprofil ist da`,
        htmlContent: emailHtml
      })
    });

    return res.status(200).json({ success: true });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

function buildEmailHtml(vorname, nachname, r) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 20px"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%">
<tr><td style="background:#8C05BD;padding:32px 40px">
  <p style="font-family:sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin:0 0 8px">Triggerprofil von ${vorname} ${nachname}</p>
  <h1 style="font-size:24px;font-weight:400;color:white;margin:0 0 8px;line-height:1.3">${r.profilName}</h1>
  <p style="font-family:sans-serif;font-size:13px;color:rgba(255,255,255,0.88);margin:0;line-height:1.5">${r.profilSub}</p>
</td></tr>
<tr><td style="padding:32px 40px">
  <p style="font-family:sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8C05BD;margin:0 0 8px">Dein Kernmuster</p>
  <p style="font-size:14px;line-height:1.75;color:#1A1A1A;margin:0 0 24px">${r.kernmuster}</p>
  <p style="font-family:sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8C05BD;margin:0 0 8px">Was dieses Muster kostet</p>
  <p style="font-size:14px;line-height:1.75;color:#1A1A1A;margin:0 0 24px">${r.tiefe}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
    <td width="48%" valign="top" style="background:#f9f9f9;border:1px solid #d9d9d9;border-radius:8px;padding:16px 20px">
      <p style="font-family:sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#8C05BD;margin:0 0 8px">Körpersignal</p>
      <p style="font-size:13px;line-height:1.7;color:#1A1A1A;margin:0">${r.koerper}</p>
    </td>
    <td width="4%"></td>
    <td width="48%" valign="top" style="background:#F3E5FA;border-left:3px solid #8C05BD;border-radius:0 5px 5px 0;padding:16px 20px">
      <p style="font-family:sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#8C05BD;margin:0 0 8px">Eine Frage für dich</p>
      <p style="font-size:13px;line-height:1.7;color:#1A1A1A;margin:0;font-style:italic">${r.musterFrage}</p>
    </td>
  </tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d9d9d9;border-radius:8px;overflow:hidden">
    <tr><td style="padding:24px 28px;background:#FAFAFA">
      <p style="font-family:sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8C05BD;margin:0 0 10px">Eine persönliche Einladung von Caro</p>
      <p style="font-size:14px;line-height:1.75;color:#555;font-style:italic;margin:0 0 20px">${r.einladung}</p>
      <a href="https://carobrandtcoaching.de" style="display:block;background:#8C05BD;color:white;text-decoration:none;text-align:center;padding:13px 28px;font-family:sans-serif;font-size:13px;border-radius:4px">Kostenloses Klarheitsgespräch buchen</a>
    </td></tr>
  </table>
  <p style="text-align:center;font-family:sans-serif;font-size:11px;color:#999;margin-top:24px">Bleib bei dir. Caro</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}
