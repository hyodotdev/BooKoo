// shared/ipCountry.ts
var ISO_ALPHA2_COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";
function normalizeIpCountryCode(value) {
  if (typeof value !== "string")
    return;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "ZZ")
    return;
  return ` ${ISO_ALPHA2_COUNTRY_CODES} `.includes(` ${code} `) ? code : undefined;
}

// scripts/public-site/country-api.ts
var country_api_default = {
  fetch(request) {
    const countryCode = request.method === "GET" && process.env.VERCEL === "1" ? normalizeIpCountryCode(request.headers.get("x-vercel-ip-country")) : undefined;
    return Response.json({ countryCode: countryCode ?? null }, {
      status: request.method === "GET" ? 200 : 405,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        ...request.method === "GET" ? {} : { Allow: "GET" }
      }
    });
  }
};
export {
  country_api_default as default
};
