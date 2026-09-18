import { Router } from 'express';
import { placeSearch, routesByPlaces, rangeQueryRoute, summary } from '../controllers/trafficController.js';

const r = Router();

r.get('/places/search', placeSearch);
r.post('/routes/places', routesByPlaces);
r.post('/routes/range-query', rangeQueryRoute);
r.get('/traffic/summary', summary);

export default r;
