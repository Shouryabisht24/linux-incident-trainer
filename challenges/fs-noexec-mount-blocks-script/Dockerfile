FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils util-linux && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# /opt/deploy is a noexec tmpfs, empty at container start (see challenge.json
# "tmpfs"). Write the actual migration script there at runtime, not build
# time, matching the AUTHORING.md tmpfs-is-empty-at-start rule.
CMD ["sh","-c","mkdir -p /opt/deploy && printf '#!/bin/sh\\necho migration ok > /var/lib/app/migration.done\\n' > /opt/deploy/run-migration.sh && chmod +x /opt/deploy/run-migration.sh && exec sleep infinity"]
