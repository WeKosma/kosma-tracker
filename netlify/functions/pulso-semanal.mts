// Tarea programada de Netlify: Pulso semanal del pipeline.
// Lunes 12:00 UTC = 7:00 a. m. en Bogotá.
const run = async () => {
  const base = process.env.APP_URL || process.env.URL;
  const res = await fetch(`${base}/api/cron/pulso`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  console.log("[pulso-semanal]", res.status, await res.text());
};

export default run;
export const config = { schedule: "0 12 * * 1" };
