// CSS Modules 타입 선언
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
