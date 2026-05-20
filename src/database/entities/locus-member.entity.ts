import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BigIntNumberTransformer } from '../transformers/bigint-number.transformer';
import { Locus } from './locus.entity';

@Entity({ name: 'rnc_locus_members' })
export class LocusMember {
  @PrimaryColumn({
    type: 'bigint',
    name: 'id',
    transformer: BigIntNumberTransformer,
  })
  id!: number;

  @Column({ type: 'text', name: 'urs_taxid', nullable: true })
  ursTaxid!: string | null;

  @Column({ type: 'int', name: 'region_id' })
  regionId!: number;

  @Column({
    type: 'bigint',
    name: 'locus_id',
    transformer: BigIntNumberTransformer,
  })
  locusId!: number;

  @Column({ type: 'text', name: 'membership_status' })
  membershipStatus!: string;

  @ManyToOne(
    () => Locus,
    (locus) => locus.members,
  )
  @JoinColumn({ name: 'locus_id', referencedColumnName: 'id' })
  locus!: Locus;
}
