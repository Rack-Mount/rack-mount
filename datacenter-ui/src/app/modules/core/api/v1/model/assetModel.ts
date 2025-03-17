/**
 * Datacenter API
 *
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */
import { AssetType } from './assetType';
import { Vendor } from './vendor';


/**
 * Serializer for the AssetModel model.  This serializer converts AssetModel instances to and from JSON format. It includes nested serializers for the vendor and type fields.  Attributes:     vendor (VendorSerializer): Serializer for the vendor field.     type (AssetTypeSerializer): Serializer for the type field.  Meta:     model (AssetModel): The model that is being serialized.     fields (list): List of fields to be included in the serialization.         - name: The name of the asset model.         - vendor: The vendor of the asset model.         - type: The type of the asset model.         - rack_units: The number of rack units the asset model occupies.         - front_image: The front image of the asset model.         - rear_image: The rear image of the asset model.         - note: Additional notes about the asset model.
 */
export interface AssetModel { 
    name?: string;
    vendor: Vendor;
    type: AssetType;
    rack_units?: number;
    front_image?: string | null;
    rear_image?: string | null;
    note?: string;
}

