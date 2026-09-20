// Mock station data across Lagos, Nigeria. Coordinates are approximate
// neighborhood centers, good enough for a map demo (not survey-accurate).
const STATIONS = [
  { name: 'Lekki Phase 1 Charging Hub', address: 'Admiralty Way, Lekki Phase 1, Lagos', lat: 6.4432, lng: 3.4698 },
  { name: 'Victoria Island EV Point', address: 'Adeola Odeku St, Victoria Island, Lagos', lat: 6.4281, lng: 3.4219 },
  { name: 'Ikeja GRA Charge Station', address: 'Oduduwa Way, Ikeja GRA, Lagos', lat: 6.5833, lng: 3.3500 },
  { name: 'Surulere Power Stop', address: 'Adeniran Ogunsanya St, Surulere, Lagos', lat: 6.5000, lng: 3.3562 },
  { name: 'Yaba Tech Charge Point', address: 'Herbert Macaulay Way, Yaba, Lagos', lat: 6.5095, lng: 3.3711 },
  { name: 'Ajah Roundabout Charging Bay', address: 'Lekki-Epe Expressway, Ajah, Lagos', lat: 6.4698, lng: 3.5850 },
  { name: 'Ikoyi Waterside EV Station', address: 'Bourdillon Rd, Ikoyi, Lagos', lat: 6.4541, lng: 3.4316 },
  { name: 'Apapa Port Charging Hub', address: 'Wharf Rd, Apapa, Lagos', lat: 6.4488, lng: 3.3591 },
  { name: 'Magodo Estate Charge Point', address: 'CMD Rd, Magodo, Lagos', lat: 6.6167, lng: 3.3833 },
  { name: 'Gbagada Express Charging', address: 'Gbagada Expressway, Gbagada, Lagos', lat: 6.5500, lng: 3.3833 },
  { name: 'Oshodi Transport Hub Charger', address: 'Oshodi-Apapa Expressway, Oshodi, Lagos', lat: 6.5500, lng: 3.3167 },
  { name: 'Ikorodu Road Charging Station', address: 'Ikorodu Rd, Ikorodu, Lagos', lat: 6.6018, lng: 3.5106 },
  { name: 'Festac Town Power Bay', address: '1st Avenue, Festac Town, Lagos', lat: 6.4667, lng: 3.2833 },
];

exports.seed = async function seed(knex) {
  const operator = await knex('users').where({ email: 'operator@example.com' }).first();
  if (!operator) {
    throw new Error('Operator user not found — run 01_users seed first');
  }

  await knex('stations').insert(
    STATIONS.map((station) => ({ ...station, owner_id: operator.id }))
  );
};
