export enum ServiceLevel {
  /* *
   * This enum is like a universal translator for shipping speeds. Instead of 
   * dealing with carrier-specific terms like 'Next Day Air' or 'Priority 
   * Overnight', we just use these three standard levels. Each carrier adapter 
   * is then responsible for mapping these to their actual API codes.
   */
  GROUND = 'GROUND',
  EXPRESS = 'EXPRESS',
  OVERNIGHT = 'OVERNIGHT',
}