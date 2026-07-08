import express from 'express'
import { getCitiesByCountry, getCountriesAndCities } from '../controllers/country.controller';


const router = express.Router()

router.get('/', getCountriesAndCities);

router.post('/cities', getCitiesByCountry);

export default router
