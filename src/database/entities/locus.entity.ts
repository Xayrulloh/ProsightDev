import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { BigIntNumberTransformer } from '../transformers/bigint-number.transformer';
import { LocusMember } from './locus-member.entity';

@Entity({ name: 'rnc_locus' })
export class Locus {
  @PrimaryColumn({
    type: 'bigint',
    name: 'id',
    transformer: BigIntNumberTransformer,
  })
  id!: number;

  @Column({ type: 'text', name: 'assembly_id' })
  assemblyId!: string;

  @Column({ type: 'text', name: 'locus_name' })
  locusName!: string;

  @Column({ type: 'text', name: 'public_locus_name' })
  publicLocusName!: string;

  @Column({ type: 'text', name: 'chromosome' })
  chromosome!: string;

  @Column({ type: 'text', name: 'strand' })
  strand!: string;

  @Column({ type: 'int', name: 'locus_start' })
  locusStart!: number;

  @Column({ type: 'int', name: 'locus_stop' })
  locusStop!: number;

  @Column({ type: 'int', name: 'member_count' })
  memberCount!: number;

  @OneToMany(
    () => LocusMember,
    (member) => member.locus,
  )
  members!: LocusMember[];
}
