/**
 * Datacenter API
 *
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


export interface DataCenterLocation { 
    readonly id?: number;
    name: string;
    short_name: string;
    location: string;
    capacity: number;
    readonly operational_since?: string;
    manager?: string;
    manager_mail?: string | null;
}

