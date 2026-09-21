// Mock station data for Ogun and Oyo State. Like the Lagos set, coordinates are approximate
// town/neighbourhood centres, good enough for a map demo (not survey-accurate), and the
// street names are indicative. Names must stay unique: the seed skips a station whose name
// already exists, which is what makes it safe to re-run.
const OGUN = [
  { name: 'Abeokuta Kuto Charging Hub', address: 'Kuto Road, Kuto, Abeokuta, Ogun State', lat: 7.1490, lng: 3.3355 },
  { name: 'Oke-Mosan EV Point', address: 'Presidential Boulevard, Oke-Mosan, Abeokuta, Ogun State', lat: 7.1601, lng: 3.3583 },
  { name: 'Ibara GRA Charge Station', address: 'Ibara GRA, Abeokuta, Ogun State', lat: 7.1338, lng: 3.3467 },
  { name: 'FUNAAB Campus Charging Bay', address: 'Alabata Road, FUNAAB, Abeokuta, Ogun State', lat: 7.2260, lng: 3.4380 },
  { name: 'Sagamu Interchange Charging Hub', address: 'Lagos-Ibadan Expressway, Sagamu, Ogun State', lat: 6.8412, lng: 3.6432 },
  { name: 'Ijebu-Ode Central Charge Point', address: 'Ibadan Road, Ijebu-Ode, Ogun State', lat: 6.8190, lng: 3.9170 },
  { name: 'Canaanland Ota Charging Point', address: 'Canaanland, Sango-Ota, Ogun State', lat: 6.6721, lng: 3.1586 },
  { name: 'Ifo Power Stop', address: 'Abeokuta Road, Ifo, Ogun State', lat: 6.8148, lng: 3.1997 },
  { name: 'Mowe Expressway Charging Hub', address: 'Lagos-Ibadan Expressway, Mowe, Ogun State', lat: 6.8060, lng: 3.4360 },
  { name: 'Ilaro Roundabout Charging Bay', address: 'Ilaro, Ogun State', lat: 6.8895, lng: 3.0070 },
];

const OYO = [
  { name: 'Bodija Market EV Point', address: 'Bodija, Ibadan, Oyo State', lat: 7.4365, lng: 3.9138 },
  { name: 'Ring Road Charging Hub', address: 'Ring Road, Ibadan, Oyo State', lat: 7.3955, lng: 3.9095 },
  { name: 'Dugbe Charge Station', address: 'Dugbe, Ibadan, Oyo State', lat: 7.3900, lng: 3.8838 },
  { name: 'Challenge Roundabout Power Stop', address: 'Challenge, Ibadan, Oyo State', lat: 7.3615, lng: 3.8865 },
  { name: 'University of Ibadan EV Bay', address: 'University of Ibadan, Ibadan, Oyo State', lat: 7.4440, lng: 3.8995 },
  { name: 'Iwo Road Interchange Hub', address: 'Iwo Road, Ibadan, Oyo State', lat: 7.4000, lng: 3.9400 },
  { name: 'Oyo Town Charging Point', address: 'Oyo-Ogbomoso Road, Oyo, Oyo State', lat: 7.8527, lng: 3.9312 },
  { name: 'Ogbomoso Central Charging Hub', address: 'Ogbomoso, Oyo State', lat: 8.1340, lng: 4.2450 },
  { name: 'Iseyin Power Stop', address: 'Iseyin, Oyo State', lat: 7.9700, lng: 3.5920 },
  { name: 'Saki Charging Bay', address: 'Saki, Oyo State', lat: 8.6710, lng: 3.3950 },
];

// Each state has its own operator account, so a demo operator sees (and can manage) only the
// stations that belong to them. The Lagos stations stay with operator@example.com.
const OGUN_OPERATOR = { name: 'Olumide Adebayo', email: 'ogun.operator@example.com' };
const OYO_OPERATOR = { name: 'Kemi Ajayi', email: 'oyo.operator@example.com' };

// Where the Lagos stations (13) leave off, so the deterministic charger mix (and the odd
// offline/unavailable charger) carries on across the new stations.
const REGION_INDEX_OFFSET = 13;

module.exports = {
  OGUN,
  OYO,
  OGUN_OPERATOR,
  OYO_OPERATOR,
  // In this order: it fixes each station's position, and so the charger mix it is seeded with.
  REGIONS: [
    { operator: OGUN_OPERATOR, stations: OGUN },
    { operator: OYO_OPERATOR, stations: OYO },
  ],
  REGION_STATIONS: [...OGUN, ...OYO],
  REGION_INDEX_OFFSET,
};
