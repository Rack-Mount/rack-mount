export * from './asset.service';
import { AssetService } from './asset.service';
export * from './asset.serviceInterface';
export * from './datacenter.service';
import { DatacenterService } from './datacenter.service';
export * from './datacenter.serviceInterface';
export const APIS = [AssetService, DatacenterService];
