-- Ciclo E: topes de Storage alineados al app (capacidad Free).
-- Retratos: 1 MB (el upload ya comprime a ~100 KB WebP).
-- Comprobantes: 2 MB (imágenes se comprimen en browser; PDF cabe cómodo).

update storage.buckets
set file_size_limit = 1048576
where id = 'athlete-photos';

update storage.buckets
set file_size_limit = 2097152
where id in ('athlete-payment-proofs', 'ticket-payment-proofs');
