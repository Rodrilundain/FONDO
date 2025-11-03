try {
  // Usamos proxy público confiable para evitar CORS
  const proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(SOURCE_URL);
  const res = await fetch(proxyUrl);
  const dataProxy = await res.json();
  const html = dataProxy.contents;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const text = doc.body.innerText.replace(/\s+/g, " ").trim();

  const lower = query.toLowerCase();
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 40);
  const found = sentences.filter(s => s.toLowerCase().includes(lower));

  if (found.length > 0) {
    const reply = found.slice(0, 3).join(". ") + ".";
    document.querySelector(".msg.bot:last-child").textContent = reply;
    mainColor = "#7eff8b"; // verde si encuentra info
    pulse = 6;
  } else {
    document.querySelector(".msg.bot:last-child").textContent = "🔎 No encontré información exacta, consultando al sistema central...";
    mainColor = "#ffd166";
    pulse = 6;

    // Fallback a ChatGPT
    const gptRes = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query })
    });

    const data = await gptRes.json();
    document.querySelector(".msg.bot:last-child").textContent =
      data.reply || "⚡ No obtuve respuesta del servidor.";
    mainColor = data.color || "#7dcaff";
    pulse = 6;
  }
} catch (err) {
  console.error("Error:", err);
  document.querySelector(".msg.bot:last-child").textContent =
    "⚡ Error accediendo al sitio o servidor. Revisá la conexión.";
  mainColor = "#ff8080";
}
