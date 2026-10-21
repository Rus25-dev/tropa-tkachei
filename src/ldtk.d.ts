// Файлы проектов LDtk — это JSON; тип разбирает и проверяет загрузчик core/ldtk.ts, поэтому снаружи это unknown.
declare module '*.ldtk' {
  const project: unknown;
  export default project;
}
