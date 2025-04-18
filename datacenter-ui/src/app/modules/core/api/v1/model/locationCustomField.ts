/**
 * Datacenter API
 *
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */


/**
 * Serializer for the LocationCustomField model.  This serializer uses HyperlinkedModelSerializer to provide a hyperlinked representation of the LocationCustomField model. It includes the following fields: - id: An integer field that is read-only. - url: A hyperlinked identity field that is read-only and points to the \'locationcustomfield-detail\' view.  Meta:     model: The model that is being serialized (LocationCustomField).     fields: Specifies that all fields of the model should be included in the serialization.
 */
export interface LocationCustomField { 
    readonly url: string;
    readonly id: number;
    field_name: string;
    field_value?: string;
    location: string;
}

