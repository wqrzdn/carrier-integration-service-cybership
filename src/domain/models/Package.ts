export interface Package {
  /* *
   * Simple package model for weights and sizes. For now, we're sticking to 
   * inches and pounds since that's what UPS prefers. I've nested the 
   * dimensions to keep the object structure organized.
   */
  weight: number; 
  dimensions: {
    length: number; 
    width: number;  
    height: number;
  };
}