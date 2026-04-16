const fetch = require('node-fetch');

async function getLutonCharge(plate) {
  try {
    const clean = plate.replace(/\s+/g, '').toUpperCase();
    const res = await fetch('https://lutondropoff.apcoa.com/latepaysearch/vrnsearch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://lutondropoff.apcoa.com/latepaysearch/vrnsearch',
      },
      body: `vrn=${clean}`,
    });
    const html = await res.text();
    console.log('[LUTON] response:', html.substring(0, 500));
    return { raw: html };
  } catch (e) {
    console.log('[LUTON] error:', e.message);
    return null;
  }
}

module.exports = { getLutonCharge };
