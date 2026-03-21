import { PortTypeEnum } from '../../../../core/api/v1/model/portTypeEnum';
import { SideEnum } from '../../../../core/api/v1/model/sideEnum';

export type AssetModelPortType = PortTypeEnum;
export type AssetModelPortSide = SideEnum;

export const ASSET_MODEL_PORT_TYPES: { value: PortTypeEnum; label: string }[] =
  [
    { value: PortTypeEnum.Rj45, label: 'RJ45 (1GbE)' },
    { value: PortTypeEnum.Sfp, label: 'SFP (1G)' },
    { value: PortTypeEnum.Sfp2, label: 'SFP+ (10G)' },
    { value: PortTypeEnum.Sfp28, label: 'SFP28 (25G)' },
    { value: PortTypeEnum.Qsfp, label: 'QSFP+ (40G)' },
    { value: PortTypeEnum.Qsfp28, label: 'QSFP28 (100G)' },
    { value: PortTypeEnum.QsfpDd, label: 'QSFP-DD (400G)' },
    { value: PortTypeEnum.Lc, label: 'LC Fiber' },
    { value: PortTypeEnum.Sc, label: 'SC Fiber' },
    { value: PortTypeEnum.Fc, label: 'Fibre Channel' },
    { value: PortTypeEnum.UsbA, label: 'USB-A' },
    { value: PortTypeEnum.UsbC, label: 'USB-C' },
    { value: PortTypeEnum.Serial, label: 'Serial Console' },
    { value: PortTypeEnum.Mgmt, label: 'Management' },
    { value: PortTypeEnum.Hdmi, label: 'HDMI' },
    { value: PortTypeEnum.Vga, label: 'VGA' },
    { value: PortTypeEnum.Other, label: 'Other' },
  ];
