FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps acl && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
# The ACL deny entry is applied here, at container start, not in seed.sh --
# a POSIX ACL set at build time does not survive Docker's image layer
# export/import (verified empirically; see decisions/0041), so it has to be
# (re)applied every time a fresh container starts from the built image.
CMD ["sh", "-c", "setfacl -m u:etl:--- /var/data/exports/customer_export.csv && exec sleep infinity"]
