// Tarea programada de Netlify: cada hora lee los canales de Discord configurados
// y guarda en el tracker los mensajes que nombran un lead.
const run = async () => {
  const base = process.env.APP_URL || process.env.URL;
  const res = await fetch(`${base}/api/cron/discord`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  console.log("[discord-escucha]", res.status, await res.text());
};

export default run;
export const config = { schedule: "@hourly" };
