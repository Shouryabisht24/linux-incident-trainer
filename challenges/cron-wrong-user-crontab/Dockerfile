FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends cron procps sudo coreutils && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Dedicated service account the export job is actually supposed to run as.
RUN useradd -r -m -d /var/lib/invoicer -s /bin/sh invoicer

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
CMD ["sleep", "infinity"]
