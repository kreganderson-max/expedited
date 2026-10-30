const services = new Set(['Sourcing', 'Procurement', 'Logistics coordination', 'Distribution coordination', 'Other']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function clean(form, key, limit) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim().slice(0, limit + 1) : '';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/contact') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (request.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
    if (Number(request.headers.get('content-length') || 0) > 15000) return json({ error: 'Message too large' }, 413);

    let form;
    try { form = await request.formData(); }
    catch { return json({ error: 'Invalid form' }, 400); }
    if (clean(form, 'website', 100)) return json({ ok: true });

    const name = clean(form, 'name', 100);
    const company = clean(form, 'company', 120);
    const email = clean(form, 'email', 254);
    const phone = clean(form, 'phone', 40);
    const service = clean(form, 'service', 40);
    const message = clean(form, 'message', 4000);
    if (!name || name.length > 100 || !company || company.length > 120 ||
        !emailPattern.test(email) || email.length > 254 || phone.length > 40 ||
        !services.has(service) || message.length < 10 || message.length > 4000) {
      return json({ error: 'Please check the required fields.' }, 400);
    }

    const { CONTACT_ACCOUNT_ID, CONTACT_API_TOKEN, CONTACT_TO, CONTACT_FROM } = env;
    if (!CONTACT_ACCOUNT_ID || !CONTACT_API_TOKEN || !CONTACT_TO || !CONTACT_FROM) {
      return json({ error: 'Inquiry delivery is not configured.' }, 503);
    }

    const body = [
      'New Expedited Wholesale website inquiry', '',
      `Name: ${name}`, `Company: ${company}`, `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`, `Service: ${service}`, '',
      'Message:', message,
    ].join('\n');

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CONTACT_ACCOUNT_ID)}/email/sending/send`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${CONTACT_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: CONTACT_TO,
          from: CONTACT_FROM,
          subject: `Website inquiry: ${service}`,
          text: body,
        }),
      });
      const result = await response.json();
      const accepted = [...(result.result?.delivered || []), ...(result.result?.queued || [])];
      if (!response.ok || !result.success || !accepted.includes(CONTACT_TO)) {
        return json({ error: 'Inquiry delivery is temporarily unavailable.' }, 502);
      }
      return json({ ok: true });
    } catch {
      return json({ error: 'Inquiry delivery is temporarily unavailable.' }, 502);
    }
  },
};

