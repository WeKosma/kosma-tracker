// Tarea programada de Netlify: publicaciones de Instagram programadas y en proceso.
// Corre cada 5 minutos.
const run = async () => {
  const base = process.env.APP_URL || process.env.URL;
  const res = await fetch(`${base}/api/cron/instagram`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  console.log("[instagram-publicar]", res.status, await res.text());
};

export default run;
export const config = { schedule: "*/5 * * * *" };
