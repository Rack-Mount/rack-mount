/**
 * Datacenter API
 *
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */
import { Asset } from './asset';


export interface ListAssets200Response { 
    count: number;
    next?: string | null;
    previous?: string | null;
    results: Array<Asset>;
}

