import AppError from "../errors/AppError";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import CountriesAndCities from "./countryModel/model/countriesAndCities";
import CountriesAndCodes from "./countryModel/model/countriesAndCodes";
import CountriesAndFlag from "./countryModel/model/countriesAndFlag";
import CountriesState from "./countryModel/model/countriesAndState";
import CountriesAndUnicodes from "./countryModel/model/countriesAndUnicodes";
import data from "./countryModel/model/countriesStateCity";
// import CountriesAndCodes from "./countryModel/model/countriesAndCodes";

const positions = CountriesAndCodes.map((x) => ({
  name: x.name, iso2: x.iso2, long: x.longitude, lat: x.latitude,
}));

let CountriesAndCities1 = CountriesAndCities.map((x) => {
  const countryIso = CountriesAndUnicodes.find((country) => country.Name.trim().toLowerCase() === x.country.trim().toLowerCase());
  const dataObj = {
    iso2: countryIso ? countryIso.Iso2 : null,
    iso3: countryIso ? countryIso.Iso3 : null,
    ...x,
  };
  return dataObj;
});

let CountriesAndFlag1 = CountriesAndFlag.map((x) => {
  const countryIso = CountriesAndUnicodes.find((country) => country.Name.trim().toLowerCase() === x.name.trim().toLowerCase());
  const dataObj = {
    name: x.name,
    flag: x.flag,
    iso2: countryIso ? countryIso.Iso2 : null,
    iso3: countryIso ? countryIso.Iso3 : null,
  };
  return dataObj;
});

const CountriesAndISO = CountriesAndFlag1.map((x) => ({
  name: x.name,
  Iso2: x.iso2,
  Iso3: x.iso3,
}));

const CountriesAndCurrencies = CountriesAndUnicodes.map((x) => ({
  name: x.Name, currency: x.Currency, iso2: x.Iso2, iso3: x.Iso3,
}));

const CountriesAndStatesFormatted = CountriesState.map((x) => ({
  name: x.name,
  iso3: x.iso3,
  iso2: x.iso2,
  states: x.states.map((y) => ({ name: y.name, state_code: y.state_code })),
}));
const CountriesStateCityFormatted = data.map((x) => ({
  name: x.name,
  iso2: x.iso2,
  iso3: x.iso3,
  states: x.states,
}));

export const getCountriesAndCities = catchAsync(async(req, res, next)=> {

    // return Respond.success(res, 'countries and cities retrieved', CountriesAndCities1);

    return sendResponse(res,{
        statusCode: 200,
        success: true,
        message: 'countries and cities retrieved',
        data: CountriesAndCities1,
    })

})

export const getCitiesByCountry = catchAsync(async(req, res, next)=> {
    const { country, iso2 } = req.body;
    if (!country && !iso2) {
    //   return Respond.error(res, 'missing param (country or iso2)', 400);
    throw new AppError( 400,'missing param (country or iso2)');
    }
    let DB1: (typeof CountriesAndCities1)[number] | null = null;
    let DB2: (typeof CountriesStateCityFormatted)[number] | null = null;

    if (country) {
      DB1 = CountriesAndCities1.find((x) => x.country.toLowerCase() === country.toLowerCase()) || null;
      DB2 = CountriesStateCityFormatted.find((x) => x.name.toLowerCase() === country.toLowerCase()) || null;
    }
    if (iso2) {
      DB1 = CountriesAndCities1.find((x) => x.iso2?.trim().toLowerCase() === iso2.trim().toLowerCase()) || null;
      DB2 = CountriesStateCityFormatted.find((x) => x.iso2.trim().toLowerCase() === iso2.trim().toLowerCase()) || null;
    }

    if (!DB1 && !DB2) {
    //   return Respond.error(res, 'country not found', 404);
    throw new AppError( 404,'country not found');
    }
    const countryName = DB1?.country ?? DB2?.name ?? country ?? iso2 ?? 'country';
    const db1Cities = DB1?.cities ?? [];
    const db2Cities = DB2
      ? DB2.states.reduce<string[]>(
          (acc, state: { cities: { name: string }[] }) => acc.concat(state.cities.map((city) => city.name)),
          [],
        )
      : [];

    const sanitizedDb2Cities = country === 'Turkey' ? [] : db2Cities;

    const cities = [...new Set(db1Cities.concat(sanitizedDb2Cities))];
    // return Respond.success(res, `cities in ${countryName} retrieved`, cities);
    sendResponse(res,{
        statusCode: 200,
        success: true,
        message: `cities in ${countryName} retrieved`,
        data: cities,
    })

})
