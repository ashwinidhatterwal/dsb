/* delivery-estimate responsibilities. Bundled into code.gs by scripts/build.mjs.
   Estimates are intentionally configurable shop guidance, not courier guarantees. */
function getDeliveryEstimate_(pinCode) {
  const pin = String(pinCode || '').trim();
  if (!/^[1-9][0-9]{5}$/.test(pin)) return {
    success: false,
    code: 'invalid_pincode',
    error: 'Enter a valid 6-digit PIN code.'
  };
  let rule = null;
  for (let i = 0; i < DELIVERY_ESTIMATE_RULES.length; i++) {
    const candidate = DELIVERY_ESTIMATE_RULES[i];
    if ((candidate.prefixes || []).some(prefix => prefix === '*' || pin.indexOf(String(prefix)) === 0)) {
      rule = candidate;
      break;
    }
  }
  rule = rule || { minDays: 4, maxDays: 7, label: 'Standard delivery' };
  return {
    success: true,
    pinCode: pin,
    minDays: Math.max(1, Math.floor(safeNumber_(rule.minDays, 4))),
    maxDays: Math.max(1, Math.floor(safeNumber_(rule.maxDays, 7))),
    label: String(rule.label || 'Estimated delivery'),
    note: 'Estimate starts after shop confirmation and is not a courier guarantee.'
  };
}
