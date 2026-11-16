/**
 * A MADE-UP register, in the format `parseRegister` expects (src/domain/register/parse.ts). It
 * stands in for the PSRA's download locally and in tests, so nothing needs the real file to
 * build. Every business, name and number here is invented. Never used in production.
 *
 * It holds what a real register would: businesses licensed to let, businesses licensed for
 * other things only (dropped), and people's own licences (dropped, never stored).
 */
export const sampleRegisterCsv = `Licence Number,Licensee Name,Trading Name,Licence Type,Licence Category,County,Licence Expiry
001234,Halcyon Lettings Limited,Halcyon Lettings,Company,"A, B, C, D",Dublin,2027-05-31
001235,Rowan and Byrne Property Limited,Rowan & Byrne,Company,"B, C",Dublin,2027-03-31
001236,Corrib Homes Limited,,Company,"C, D",Galway,2027-08-31
001237,Ó Súilleabháin & Daughters,Lee Valley Lettings,Partnership,C,Cork,2027-01-31
001238,Shannonside Property Services Limited,Shannonside Lettings,Company,"A, B, C",Limerick,2027-06-30
001239,Liffey Quay Estates Limited,Liffey Quay,Company,"A, B, C, D",Dublin,2027-02-28
001240,Slaney Auctioneers Limited,Slaney Auctioneers,Company,"A, B",Wexford,2027-04-30
001241,Blackwater Block Management Limited,,Company,D,Waterford,2027-07-31
001242,Aisling Carroll,Carroll Lettings,Sole Trader,C,Kilkenny,2027-09-30
001243,"Moy, Deel and Partners",Moy Lettings,Partnership,"B, C",Mayo,2027-10-31
001244,Harbour Row Residential Limited,Harbour Row,Company,C,Cork,2027-11-30
001245,Halcyon Homes (Galway) Limited,Halcyon Homes Galway,Company,C,Galway,2027-12-31
001246,Tolka Park Lettings Limited,Tolka Park Lettings,Company,"C, D",Dublin,2027-05-31
001247,Barrow Valley Estates Limited,,Company,"A, B, C",Carlow,2027-03-31
001234-004501,Ciara Whelan,,Employee,"A, B, C, D",Dublin,2027-05-31
001234-004502,Declan Farrell,,Principal Officer,"A, B, C, D",Dublin,2027-05-31
001238-004611,Orla Tierney,,Independent Contractor,C,Limerick,2027-06-30
`;
