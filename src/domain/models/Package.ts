export interface Package {
  /* *
   * simple package model for weights and sizes. for now we are sticking to 
   * inches and pounds since that is what ups prefers. i nested the 
   * dimensions to keep the object structure organized.
   */
  weight: number; 
  dimensions: {
    length: number; 
    width: number;  
    height: number;
  };
}