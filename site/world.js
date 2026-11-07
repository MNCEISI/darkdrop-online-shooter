// Shared geometry: both client rendering and server collisions use these dimensions.
export const ARENA = 42;
export const BOXES = [
  { x:0, z:0, w:9, d:8, h:5, kind:'command' },
  { x:-21, z:-15, w:12, d:7, h:5, kind:'hangar' },
  { x:22, z:15, w:12, d:7, h:5, kind:'hangar' },
  { x:23, z:-19, w:9, d:7, h:6, kind:'hangar' },
  { x:-22, z:19, w:9, d:7, h:6, kind:'hangar' },
  { x:0, z:22, w:15, d:4, h:3.5, kind:'barricade' },
  { x:0, z:-22, w:15, d:4, h:3.5, kind:'barricade' },
  { x:-13, z:0, w:5, d:8, h:2.6, kind:'container' },
  { x:13, z:0, w:5, d:8, h:2.6, kind:'container' },
  { x:-13, z:13, w:5, d:3, h:2.3, kind:'container' },
  { x:13, z:-13, w:5, d:3, h:2.3, kind:'container' },
  { x:-32, z:0, w:4, d:7, h:2.4, kind:'container' },
  { x:32, z:0, w:4, d:7, h:2.4, kind:'container' },
  { x:-4, z:11, w:3, d:3, h:2, kind:'crate' },
  { x:5, z:-11, w:3, d:3, h:2, kind:'crate' },
  { x:18, z:29, w:4, d:4, h:2, kind:'crate' },
  { x:-18, z:-29, w:4, d:4, h:2, kind:'crate' }
];
export const SPAWNS = [
  [-34,-34],[34,34],[-34,33],[34,-34],[-2,33],[3,-33],[-36,10],[36,-10],[-29,4],[29,-4]
];
export const MEDKITS = [[-28,9],[29,9],[-12,-29],[12,29]];
export const WEAPONS = {
  rifle: { name:'VORTEX AR', damage:22, cooldown:145, mag:30, reserve:150, reload:1600, range:75, spread:0.020 },
  smg: { name:'PHANTOM SMG', damage:13, cooldown:92, mag:40, reserve:200, reload:1250, range:50, spread:0.038 },
  dmr: { name:'RAIL DMR', damage:46, cooldown:450, mag:12, reserve:60, reload:1950, range:95, spread:0.006 }
};
