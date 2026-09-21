// "Search by name or town". A station matches when every word typed appears in its name or in
// its locality: the last two parts of the address, which is the town and state ("Bodija,
// Ibadan, Oyo State" -> "Ibadan, Oyo State"). Streets are left out on purpose, otherwise "Ogun"
// finds Adeniran Ogunsanya Street in Lagos and "Ibadan" finds every station on the Lagos-Ibadan
// Expressway in Ogun.
export function localityOf(address = '') {
  return address.split(',').slice(-2).join(',');
}

export function matchesStationSearch(station, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${station.name} ${localityOf(station.address)}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
