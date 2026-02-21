export enum ServiceLevel {
  /* *
   * this enum is like a universal translator for shipping speeds. instead of 
   * dealing with carrier specific terms like next day air or priority 
   * overnight we just use these three standard levels. each carrier adapter 
   * is then responsible for mapping these to their actual api codes.
   */
  GROUND = 'GROUND',
  EXPRESS = 'EXPRESS',
  OVERNIGHT = 'OVERNIGHT',
}