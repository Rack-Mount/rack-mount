/**
 * Datacenter API
 *
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */
import { Rack } from './rack';


export interface ListRacks200Response { 
    count: number;
    next?: string | null;
    previous?: string | null;
    results: Array<Rack>;
}

