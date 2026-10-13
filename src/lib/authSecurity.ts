export type PasswordCheck={ok:true}|{ok:false;message:string};

const SYMBOL=/[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,./`~]/;

export function validateStrongPassword(password:string):PasswordCheck{
  if(password.length<10)return{ok:false,message:'Usa al menos 10 caracteres.'};
  if(!/[a-z]/.test(password))return{ok:false,message:'Agrega al menos una letra minúscula.'};
  if(!/[A-Z]/.test(password))return{ok:false,message:'Agrega al menos una letra mayúscula.'};
  if(!/[0-9]/.test(password))return{ok:false,message:'Agrega al menos un número.'};
  if(!SYMBOL.test(password))return{ok:false,message:'Agrega al menos un símbolo.'};
  return{ok:true};
}
