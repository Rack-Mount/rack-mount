export * from './asset.service';
import { AssetService } from './asset.service';
export * from './asset.serviceInterface';
export * from './location.service';
import { LocationService } from './location.service';
export * from './location.serviceInterface';
export const APIS = [AssetService, LocationService];
