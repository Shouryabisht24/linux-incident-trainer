FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive container=docker
RUN apt-get update && \
    apt-get install -y --no-install-recommends systemd systemd-sysv nginx curl procps sudo && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Drop units that are meaningless/harmful inside a container.
RUN find /etc/systemd/system /lib/systemd/system -path '*.wants/*' \
      \( -name '*getty*' -o -name '*udev*' -o -name 'systemd-firstboot*' \) -exec rm -f {} \; 2>/dev/null || true

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

CMD ["/sbin/init"]
