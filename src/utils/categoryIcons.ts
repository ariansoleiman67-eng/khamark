// src/utils/categoryIcons.ts
export const getCategoryIconName = (categoryName: string) => {
  const n = (categoryName || '').toLowerCase();

  // "All Categories" case
  if (n === 'all' || n.includes('all')) return 'view-grid-outline';

  if (n.includes('engine')) return 'piston'; // Mechanical engine part instead of generic car engine block
  if (n.includes('brake')) return 'car-brake-alert'; // Standard brake rotor visual, matches trucks
  if (n.includes('suspension')) return 'cogs'; // Heavy duty mechanical representation
  if (n.includes('steering')) return 'steering'; // Steering wheel
  if (n.includes('transmission')) return 'car-shift-pattern';
  if (n.includes('electrical')) return 'car-battery'; // Industrial block battery
  if (n.includes('cooling')) return 'radiator';
  if (n.includes('exhaust')) return 'pipe';
  if (n.includes('fuel')) return 'gas-station'; // Standard recognizable icon
  if (n.includes('air conditioning') || n.includes('a/c')) return 'fan';
  if (n.includes('body')) return 'truck'; // Commercial truck face
  if (n.includes('interior')) return 'seat'; // Generic commercial seat, not a passenger car bucket seat
  if (n.includes('exterior')) return 'truck-flatbed'; // Heavy duty exterior representation
  if (n.includes('lighting')) return 'head-lightbulb';
  if (n.includes('wipers')) return 'wiper'; // Literal windshield wiper blade!
  if (n.includes('filters')) return 'air-filter'; // Perfect heavy-duty air filter icon!
  if (n.includes('belts') || n.includes('hoses')) return 'sync'; // Better representation for engine pulleys/belts
  if (n.includes('ignition')) return 'flash'; // Ignition flash / spark
  if (n.includes('sensors')) return 'memory'; // ECU / Microchip
  if (n.includes('turbo')) return 'turbine'; // Perfect for a truck turbocharger!
  if (n.includes('wheels') || n.includes('tires')) return 'car-tire-alert'; // Tire tread
  if (n.includes('oil')) return 'oil';
  if (n.includes('accessories')) return 'toolbox';

  // General / other: neutral catch-all category icon
  if (n.includes('general') || n.includes('other')) return 'truck-trailer';

  return 'truck-trailer'; // fallback
};
