import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NombreInternoParamDto {
  @ApiProperty({
    example: 'RPT_COMISIONES',
    description: 'Nombre interno o slug del reporte (ej. RPT_POLIZAS, RPT_COMISIONES)',
  })
  nombreInterno!: string;
}

export class SchemaMetaQueryDto {
  @ApiPropertyOptional({
    description: 'Identificador de usuario numérico opcional (si no se envía en x-cusuario)',
    example: 1,
  })
  cusuario?: number;
}
