import { CONNECTOR_LABELS } from './format.js';

// The connector(s) a driver's car takes, from their account ([] when they haven't said).
export function carConnectors(user) {
  return user?.role === 'driver' && Array.isArray(user.connector_types) ? user.connector_types : [];
}

// true / false when the driver has recorded their car's connectors, null when we can't tell.
export function fitsCar(user, connectorType) {
  const mine = carConnectors(user);
  return mine.length === 0 ? null : mine.includes(connectorType);
}

export function connectorList(types) {
  return types.map((type) => CONNECTOR_LABELS[type] || type).join(', ');
}
